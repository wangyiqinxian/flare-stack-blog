import { createFileRoute } from "@tanstack/react-router";
import { buildFeed } from "@/features/posts/utils/feed";

export const Route = createFileRoute("/atom.xml")({
  server: {
    handlers: {
      GET: async ({ context: { env } }) => {
        const feed = await buildFeed(env);

        return new Response(feed.atom1(), {
          headers: {
            "Content-Type": "application/atom+xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
          },
        });
      },
    },
  },
});
