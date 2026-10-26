'use client';
import { DashboardLoading } from '@/components/skeletons';
import { HomeIntro } from '@/components/home-intro';
import { useViewer } from '@/components/viewer';

// Visitors see the same introduction as on the page, so the list does not move down when it arrives.
export default function Loading() {
  const { signedIn } = useViewer();
  return signedIn ? <DashboardLoading /> : <><HomeIntro /><DashboardLoading titled /></>;
}
