import App from "@/components/App";
import { getTeams } from "@/lib/teams";

// The team list comes from the DB, so this page can't be statically prerendered.
export const dynamic = "force-dynamic";

export default function Page() {
  return <App teams={getTeams()} />;
}
