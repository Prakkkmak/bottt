import { Clock3 } from 'lucide-react';
import { NotFoundNote } from '@/components/not-found-note';
// Next.js also renders this page while prefetching some links, so it reads the account from the layout instead of loading data.
export default function NotFound() {
  return <div className="centered-panel panel"><Clock3 size={35} /><h1>Le village est ailleurs.</h1><NotFoundNote /></div>;
}
