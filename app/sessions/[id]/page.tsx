import { notFound, redirect } from 'next/navigation';
import { getData } from '@/lib/data';
import { sessionUrl, sessionName } from '@/lib/utils';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getData();
  const session = data.sessions.find(s => s.id === id);
  return { title: session ? sessionName(session) : 'Session' };
}
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getData();
  if (!data.sessions.some(s => s.id === id)) notFound();
  redirect(sessionUrl(id));
}
