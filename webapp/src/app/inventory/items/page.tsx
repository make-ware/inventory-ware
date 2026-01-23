import { redirect } from 'next/navigation';

export default function ItemsPage() {
  redirect('/inventory?tab=items');
}
