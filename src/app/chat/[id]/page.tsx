import JiffWorkspace from "@/components/JiffWorkspace";

interface ChatPageProps {
    params: Promise<{ id: string }>;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: ChatPageProps) {
    const { id } = await params;

    return <JiffWorkspace conversationId={id} />;
}
