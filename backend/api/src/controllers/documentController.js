import { supabase } from '../config/db.js';
import logger from '../middleware/logger.js';
import {
  validateDocumentBuffer,
  DocumentValidationError,
} from '../lib/documentValidation.js';
import { scanDocument, MalwareScanError } from '../lib/malwareScanner.js';

const ALLOWED_DOCUMENT_TYPES = Object.freeze([
  'aadhaar_card',
  'pan_card',
  'driving_licence',
  'rc_book',
  'other',
]);

// Maximum time allowed for malware scanning before aborting (5 seconds)
const SCAN_TIMEOUT_MS = 5000;

/**
 * Handles a driver KYC document upload. The file itself is validated
 * server-side by inspecting its magic bytes (see lib/documentValidation.js)
 * rather than trusting the client-supplied extension or Content-Type, then
 * stored in the private driver-documents storage bucket with a metadata
 * row recording who uploaded it and its verified type.
 */
export async function uploadDriverDocument(req, res) {
  try {
    const driverId = req.user?.id;
    if (!driverId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'A document file is required' });
    }

    const documentType = req.body?.documentType;
    if (!documentType || !ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
      return res.status(400).json({
        error: `documentType must be one of: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`,
      });
    }

    let verifiedMimeType;
    try {
      verifiedMimeType = validateDocumentBuffer(req.file.buffer, req.file.mimetype);
    } catch (validationError) {
      if (validationError instanceof DocumentValidationError) {
        return res.status(422).json({ error: validationError.message });
      }
      throw validationError;
    }

    // Malware Scanning Block with AbortController Timeout Guard
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

    try {
      // Pass signal to scanDocument if supported, and race against an abort promise
      const scanPromise = scanDocument(req.file.buffer, req.file.originalname, {
        signal: controller.signal,
      });

      const abortPromise = new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          const timeoutErr = new Error('Malware scanning timed out');
          timeoutErr.name = 'TimeoutError';
          reject(timeoutErr);
        });
      });

      const scanResult = await Promise.race([scanPromise, abortPromise]);

      if (!scanResult.clean) {
        return res.status(422).json({
          error: 'Uploaded document failed malware scanning.',
        });
      }
    } catch (scanError) {
      if (scanError.name === 'TimeoutError' || scanError.name === 'AbortError') {
        logger.error(
          { driverId, documentType, timeoutMs: SCAN_TIMEOUT_MS },
          '[DocumentController] Malware scanner timed out',
        );
        return res.status(504).json({
          error: 'Malware scan service timed out. Please try again.',
        });
      }

      if (scanError instanceof MalwareScanError) {
        logger.warn(
          { driverId, documentType, reason: scanError.message },
          '[DocumentController] Upload rejected by malware scanner',
        );
        return res.status(422).json({
          error: scanError.message,
        });
      }
      throw scanError;
    } finally {
      clearTimeout(timeoutId);
    }

    const extension = verifiedMimeType === 'application/pdf' ? 'pdf'
      : verifiedMimeType === 'image/png' ? 'png'
      : 'jpg';
    const storagePath = `${driverId}/${documentType}-${Date.now()}.${extension}`;

    const { error: storageError } = await supabase.storage
      .from('driver-documents')
      .upload(storagePath, req.file.buffer, {
        contentType: verifiedMimeType,
        upsert: false,
      });

    if (storageError) {
      logger.error('[DocumentController] Failed to upload document to storage:', storageError.message);
      return res.status(500).json({ error: 'Failed to store document' });
    }

    const { data: record, error: insertError } = await supabase
      .from('driver_documents')
      .insert({
        driver_id: driverId,
        document_type: documentType,
        storage_path: storagePath,
        mime_type: verifiedMimeType,
        status: 'pending_review',
      })
      .select('id, document_type, status, created_at')
      .single();

    if (insertError) {
      logger.error('[DocumentController] Failed to record document metadata:', insertError.message);
      await supabase.storage.from('driver-documents').remove([storagePath]).catch((storageCleanErr) => {
        logger.error('[DocumentController] Failed to clean up document storage path:', storageCleanErr.message);
      });
      return res.status(500).json({ error: 'Failed to store document' });
    }

    return res.status(201).json({
      success: true,
      document: record,
    });
  } catch (err) {
    logger.error('[DocumentController] Unexpected error in uploadDriverDocument:', err.message);
    return res.status(500).json({ error: 'An unexpected error occurred' });
  }
}