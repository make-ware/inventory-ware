import { redirect } from 'next/navigation';

export default function ContainersPage() {
  redirect('/inventory?tab=containers');
}
