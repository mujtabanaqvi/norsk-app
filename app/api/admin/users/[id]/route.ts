import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { verifyAdminRequest } from '@/lib/admin-auth';
import {
  deleteUserAndData,
  deleteUserSchema,
  emailsMatch,
  getUserDetail,
  isValidUserId,
  setUserActive,
  updateUserSchema,
} from '@/lib/user-admin';

type RouteContext = { params: Promise<{ id: string }> };

async function readJson(req: NextRequest): Promise<unknown | undefined> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const { id } = await params;
    if (!isValidUserId(id)) {
      return NextResponse.json({ error: 'Ugyldig bruker-ID' }, { status: 400 });
    }

    const detail = await getUserDetail(id);
    if (!detail) {
      return NextResponse.json({ error: 'Brukeren finnes ikke' }, { status: 404 });
    }
    return NextResponse.json(detail, { status: 200 });
  } catch (error) {
    console.error('[GET /api/admin/users/[id]] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke hente bruker',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/** PATCH { isActive } — deactivating signs the user out everywhere and blocks sign-in. */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const { id } = await params;
    if (!isValidUserId(id)) {
      return NextResponse.json({ error: 'Ugyldig bruker-ID' }, { status: 400 });
    }

    const rawJson = await readJson(req);
    if (rawJson === undefined) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    const parsed = updateUserSchema.safeParse(rawJson);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validering feilet',
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const updated = await setUserActive(id, parsed.data.isActive);
    if (!updated) {
      return NextResponse.json({ error: 'Brukeren finnes ikke' }, { status: 404 });
    }
    return NextResponse.json({ user: updated }, { status: 200 });
  } catch (error) {
    console.error('[PATCH /api/admin/users/[id]] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke oppdatere bruker',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/** DELETE { confirmEmail } — permanently removes the user and all their data. */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const { id } = await params;
    if (!isValidUserId(id)) {
      return NextResponse.json({ error: 'Ugyldig bruker-ID' }, { status: 400 });
    }

    const parsed = deleteUserSchema.safeParse((await readJson(req)) ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validering feilet',
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, id)).limit(1);
    if (!user) {
      return NextResponse.json({ error: 'Brukeren finnes ikke' }, { status: 404 });
    }
    if (!emailsMatch(parsed.data.confirmEmail, user.email)) {
      return NextResponse.json({ error: 'E-postadressen stemmer ikke med brukeren.' }, { status: 400 });
    }

    const result = await deleteUserAndData(id);
    if (!result) {
      return NextResponse.json({ error: 'Brukeren finnes ikke' }, { status: 404 });
    }
    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (error) {
    console.error('[DELETE /api/admin/users/[id]] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke slette bruker',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
