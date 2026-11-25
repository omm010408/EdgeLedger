import { NextRequest, NextResponse } from 'next/server';
import { SupabaseService } from '@/lib/supabase/service';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { problemResponse } from '@/lib/api/problemDetails';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return problemResponse(400, 'Invalid Trade ID', 'A trade id parameter is required.');
  }

  const deletedFromCloud = isSupabaseConfigured ? await SupabaseService.deleteTrade(id) : false;

  return NextResponse.json({
    success: true,
    deletedId: id,
    deletedFromCloud,
  });
}
