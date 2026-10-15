import { TransfersList } from "@/components/transfers-list";
export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ status?: string; cursor?: string }> }) {
  const params = await searchParams;
  return <TransfersList status={params.status} cursor={params.cursor} />;
}
