import { NextResponse } from 'next/server';
import { getSessionDetail } from '@/lib/sessionDetail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const card = new URL(request.url).searchParams.get('card') ?? 'estimated';

  try {
    const detail = await getSessionDetail(id, card);
    if (!detail) {
      return NextResponse.json(
        { error: 'session_not_found', message: `No session matches ${id}.` },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json(detail, { headers: NO_STORE });
  } catch (error) {
    console.error('[api/session] failed', error);
    return NextResponse.json(
      {
        error: 'session_unavailable',
        message: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 500, headers: NO_STORE },
    );
  }
}
