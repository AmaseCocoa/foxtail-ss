import summaly from "./summary"
import { Context, Hono } from "hono"
import type { FC } from "hono/jsx"
import { requestInit } from "./config"
import { normalize } from "./encoding"
import { Link, ViteClient } from "vite-ssr-components/hono"
import { cache } from "hono/cache"
import { html } from "hono/html"

const app = new Hono()

const CompactSummary: FC<{ c: Context; rawUrl: string; allowPlayer: boolean }> = async ({ c, rawUrl, allowPlayer }) => {
  if (!rawUrl) {
    return <div className="w-full my-4 p-4 border border-red-400 rounded-lg text-red-700">Error: URL parameter is missing.</div>
  }

  const response = (await fetch(rawUrl, requestInit(c.req.raw))) as any as Response
  const url = new URL(response.url)
  const rewriter = new HTMLRewriter()
  const summarized = summaly({
    html: rewriter,
    request: c.req.raw,
    url,
  })
  const reader = (rewriter.transform(await normalize(response)).body as ReadableStream<Uint8Array>).getReader()
  while (!(await reader.read()).done);
  const summary = await summarized

  const showPlayer = allowPlayer && summary?.player?.url
  const summaryUrl = summary?.url
  const title = summary?.title || "No title"
  const description = summary?.description
  const sitename = summary?.sitename
  const icon = summary?.icon
  const thumbnail = summary?.thumbnail
  return (
    <html>
      <head>
        <ViteClient />
        <Link href="/src/style.css" rel="stylesheet" />
      </head>
      <body>
        <div className="w-full h-full border border-gray-200 rounded-lg overflow-hidden">
          {showPlayer ? (
            <div>
              <div className="aspect-video">
                <iframe src={summary.player.url ?? undefined} className="w-full h-full" frameBorder="0" allow={summary.player.allow?.join("; ")} allowFullScreen></iframe>
              </div>
              <div className="p-3 border-t border-gray-200">
                <a href={summaryUrl} target="_blank" rel="noopener noreferrer" className="hover:underline block">
                  <h3 className="font-bold text-gray-800 truncate text-base">{title}</h3>
                </a>
                {sitename && (
                  <div className="flex items-center text-xs text-gray-500 mt-1">
                    {icon && <img src={icon} alt="Icon" className="w-4 h-4 mr-2 rounded-full" />}
                    <span>{sitename}</span>
                  </div>
                )}
                {description && <p className="text-sm text-gray-600 mt-1 line-clamp-3">{description}</p>}
              </div>
            </div>
          ) : (
            <div class="h-full">
              <a href={summaryUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col sm:flex-row h-full hover:bg-gray-50 transition-colors no-underline">
                {thumbnail && (
                  <div className="shrink-0 h-full">
                    <img src={thumbnail} alt="Thumbnail" className="w-full sm:w-32 h-auto sm:h-35 object-cover" />
                  </div>
                )}
                <div className="p-3 overflow-hidden min-w-0 flex flex-col justify-center">
                  <h3 className="font-bold text-gray-800 truncate text-base">{title}</h3>
                  {description && <p className="text-sm text-gray-600 line-clamp-2 mt-1">{description}</p>}
                  {sitename && (
                    <div className="flex items-center text-xs text-gray-500 mt-1">
                      {icon && <img src={icon} alt="Icon" className="w-4 h-4 mr-2 rounded-full" />}
                      <span>{sitename}</span>
                    </div>
                  )}
                </div>
              </a>
            </div>
          )}
        </div>
        {html` <script async src="/static/js/iframe-resizer.child.js"></script> `}
      </body>
    </html>
  )
}

async function cachedLinkCard(c: Context) {
  const rawUrl = c.req.query("url") || ""

  const allowPlayerStr = c.req.query("allowPlayer")
  const allowPlayer = allowPlayerStr === "true" || allowPlayerStr === ""

  const summaryHtml = await CompactSummary({ c, rawUrl, allowPlayer })

  if (import.meta.env.DEV) {
    c.header("Content-Security-Policy", "frame-ancestors 'self' http://localhost:4321;")
  } else {
    c.header("Content-Security-Policy", "frame-ancestors 'self' https://amase.cc;")
  }
  
  return c.html(
    html`<!DOCTYPE html>
      ${summaryHtml ?? "Response is Empty"} `,
  )
}

if (import.meta.env.DEV) {
  app.get("/card", cachedLinkCard)
} else {
  app.get(
    "/card",
    cache({
      cacheName: "foxtail-ss",
      cacheControl: "public, max-age=604800",
    }),
    cachedLinkCard,
  )
}

export default app
