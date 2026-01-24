import { redirect } from 'next/navigation';

export default function ContainersRedirect() {
  redirect('/inventory?tab=containers');
}
