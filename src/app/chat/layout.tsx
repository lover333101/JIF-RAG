import type { ReactNode } from "react";
import { AppProvider } from "@/store/AppContext";

export default function ChatLayout({
    children,
}: {
    children: ReactNode;
}) {
    return <AppProvider>{children}</AppProvider>;
}
