import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportGripData, getNearbyGripData } from '../../src/controllers/roadConditionController.js';

const mockSupabaseAdmin = {
  from: vi.fn(),
};

vi.mock('../../src/config/db.js', () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

vi.mock('../../src/middleware/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/validation/requestSchemas.js', () => ({
  reportGripDataSchema: {
    safeParse: vi.fn(),
  },
}));

describe('roadConditionController', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {
      body: {},
      query: {},
      user: { id: 'user-123' },
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  describe('reportGripData', () => {
    it('returns 400 when schema validation fails', async () => {
      const { reportGripDataSchema } = await import('../../src/validation/requestSchemas.js');
      reportGripDataSchema.safeParse.mockReturnValue({ success: false, error: { issues: [] } });

      await reportGripData(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid payload' }));
    });

    it('returns 201 when insert succeeds', async () => {
      const { reportGripDataSchema } = await import('../../src/validation/requestSchemas.js');
      reportGripDataSchema.safeParse.mockReturnValue({
        success: true,
        data: { latitude: 23.5, longitude: 72.5, grip_index: 0.8, slip_events_count: 0 },
      });
      mockSupabaseAdmin.from.mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
      });

      await reportGripData(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 when database insert fails', async () => {
      const { reportGripDataSchema } = await import('../../src/validation/requestSchemas.js');
      reportGripDataSchema.safeParse.mockReturnValue({
        success: true,
        data: { latitude: 23.5, longitude: 72.5, grip_index: 0.8, slip_events_count: 0 },
      });
      mockSupabaseAdmin.from.mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
      });

      await reportGripData(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Database error' }));
    });
  });

  describe('getNearbyGripData', () => {
    it('returns 400 when lat is missing', async () => {
      mockReq.query = { lng: '72.5' };
      await getNearbyGripData(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when lng is missing', async () => {
      mockReq.query = { lat: '23.5' };
      await getNearbyGripData(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for invalid latitude (out of range)', async () => {
      mockReq.query = { lat: '95', lng: '72.5' };
      await getNearbyGripData(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('latitude') }));
    });

    it('returns 400 for invalid longitude (out of range)', async () => {
      mockReq.query = { lat: '23.5', lng: '200' };
      await getNearbyGripData(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('longitude') }));
    });

    it('returns 400 for invalid radius_miles (<= 0)', async () => {
      mockReq.query = { lat: '23.5', lng: '72.5', radius_miles: '-5' };
      await getNearbyGripData(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for radius_miles > 1000', async () => {
      mockReq.query = { lat: '23.5', lng: '72.5', radius_miles: '2000' };
      await getNearbyGripData(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('returns grip data on success', async () => {
      mockReq.query = { lat: '23.5', lng: '72.5' };
      const mockData = [{ id: '1', grip_index: 0.9 }];
      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: mockData, error: null }),
              }),
            }),
          }),
        }),
      });

      await getNearbyGripData(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: mockData }));
    });

    it('returns 500 on database error', async () => {
      mockReq.query = { lat: '23.5', lng: '72.5' };
      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
              }),
            }),
          }),
        }),
      });

      await getNearbyGripData(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Database error' }));
    });
  });
});
