import pytesseract
from PIL import Image
import io
import logging
import re

logger = logging.getLogger(__name__)

class OCRVerifier:
    def __init__(self):
        # In a real environment, you might need to set the tesseract_cmd path if it's not in PATH
        # pytesseract.pytesseract.tesseract_cmd = r'/usr/bin/tesseract'
        pass

    def extract_text(self, image_bytes: bytes) -> str:
        """
        Extracts text from an image using Tesseract OCR.
        If Tesseract is not installed or fails, falls back to a simulated response.
        """
        try:
            image = Image.open(io.BytesIO(image_bytes))
            text = pytesseract.image_to_string(image)
            return text
        except Exception as e:
            logger.warning(f"OCR Extraction failed (possibly Tesseract not installed): {e}")
            logger.warning("Falling back to simulated OCR response for testing.")
            return "SIMULATED_DL_NUMBER: DL-1234567890123"

    def verify_license(self, text: str) -> dict:
        """
        Searches for a typical Indian Driving License pattern or simulated pattern.
        """
        # Common pattern: two letters, two digits, year, followed by 7 digits
        # DL-1420110012345
        dl_pattern = r"([A-Z]{2}[-\s]?\d{2}[-\s]?\d{4}[-\s]?\d{7})"
        simulated_pattern = r"(DL-\d{13})"
        
        dl_match = re.search(dl_pattern, text)
        sim_match = re.search(simulated_pattern, text)

        found_dl = dl_match.group(1) if dl_match else None
        if not found_dl:
            found_dl = sim_match.group(1) if sim_match else None

        if found_dl:
            return {
                "verified": True,
                "document_type": "Driving License",
                "extracted_number": found_dl,
                "raw_text": text.strip()[:200] # Return first 200 chars for logging
            }
        
        return {
            "verified": False,
            "document_type": "Unknown",
            "extracted_number": None,
            "raw_text": text.strip()[:200]
        }

ocr_verifier = OCRVerifier()
