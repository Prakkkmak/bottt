import { getData, getAddress } from '@/lib/data';
import { sessionCalendar } from '@/lib/calendar';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getData();
  const session = data.sessions.find(s => s.id === id);
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!session) return new Response('Session introuvable.', { status: 404, headers });
  if (session.status === 'cancelled') return new Response('Cette session est annulée.', { status: 410, headers });
  const address = session.my_status === 'confirmed' || data.profile?.membership === 'organizer' ? await getAddress(id) : null;
  return new Response(sessionCalendar(session, address || session.location), { headers: {
    ...headers,
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="bottt.ics"',
  } });
}
