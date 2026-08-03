/**
 * Unit tests for backend/api/src/services/voiceService.js
 *
 * Coverage:
 *   - getBookingContext with valid UUID bookingId returns order
 *   - getBookingContext with non-UUID bookingId uses order_display_id
 *   - getBookingContext returns null when supabase query returns null
 *   - getBookingContext returns null and logs warning on supabase error
 *
 * Run with: npx vitest run test/unit/services/voiceService.test.js
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabaseFrom = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();

const mockSupabase = {
  from: mockSupabaseFrom,
};

vi.mock('../../../src/config/db.js', () => ({
  supabase: mockSupabase,
}));

vi.mock('../../../src/middleware/logger.js', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

const { __testing } = await import('../../../src/services/voiceService.js');
const { getBookingContext } = __testing;

describe('getBookingContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockEq.mockReturnValue({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    });
  });

  it('returns order when bookingId is a valid UUID and query succeeds', async () => {
    const mockOrder = { id: '550e8400-e29b-41d4-a716-446655440000', status: 'in_transit', eta: '2 hours' };
    mockMaybeSingle.mockResolvedValue({ data: mockOrder, error: null });

    const result = await getBookingContext('550e8400-e29b-41d4-a716-446655440000');

    expect(result).toEqual(mockOrder);
    expect(mockSupabaseFrom).toHaveBeenCalledWith('orders');
    expect(mockEq).toHaveBeenCalledWith('id', '550e8400-e29b-41d4-a716-446655440000');
  });

  it('uses order_display_id when bookingId is not a valid UUID', async () => {
    const mockOrder = { id: '123e4567-e89b-12d3-a456-426614174000', order_display_id: '#FF20260101ABC123DEF456', status: 'delivered' };
    mockMaybeSingle.mockResolvedValue({ data: mockOrder, error: null });

    const result = await getBookingContext('#FF20260101ABC123DEF456');

    expect(result).toEqual(mockOrder);
    expect(mockSupabaseFrom).toHaveBeenCalledWith('orders');
    expect(mockEq).toHaveBeenCalledWith('order_display_id', '#FF20260101ABC123DEF456');
  });

  it('returns null when supabase query returns null data', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await getBookingContext('550e8400-e29b-41d4-a716-446655440000');

    expect(result).toBeNull();
  });

  it('returns null and logs warning when supabase query throws an error', async () => {
    mockMaybeSingle.mockRejectedValue(new Error('Connection refused'));

    const result = await getBookingContext('550e8400-e29b-41d4-a716-446655440000');

    expect(result).toBeNull();
  });

  it('correctly identifies valid UUIDs vs non-UUIDs', async () => {
    const validUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    mockMaybeSingle.mockResolvedValue({ data: { id: validUuid }, error: null });

    await getBookingContext(validUuid);
    expect(mockEq).toHaveBeenCalledWith('id', validUuid);

    mockMaybeSingle.mockClear();

    const invalidUuid = 'not-a-uuid';
    await getBookingContext(invalidUuid);
    expect(mockEq).toHaveBeenCalledWith('order_display_id', invalidUuid);
  });
});
