import { FreeRoomsApp } from "@/components/free-rooms/free-rooms-app";

/**
 * A static shell. The schedule is fetched in the browser at runtime (FR-0 deploy
 * model), so it is never embedded in the HTML or the bundle.
 */
export default function Home() {
  return <FreeRoomsApp />;
}
