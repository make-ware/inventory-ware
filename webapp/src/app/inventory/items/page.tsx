import { redirect } from 'next/navigation';

export default function ItemsRedirect() {
  redirect('/inventory?tab=items');
}
