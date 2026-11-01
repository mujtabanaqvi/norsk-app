import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { listUsers, parseUserListParams } from '@/lib/user-admin';

/** GET ?page&pageSize&q&tier&provider&status&verified&sort — paged on the server, see lib/user-admin.ts. */
export async function GET(req: NextRequest) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const params = parseUserListParams(req.nextUrl.searchParams);
    const { users, total } = await listUsers(params);
    return NextResponse.json({ users, total, page: params.page, pageSize: params.pageSize }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/admin/users] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
