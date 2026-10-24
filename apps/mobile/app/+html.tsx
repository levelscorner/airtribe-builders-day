import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              [role="button"]:focus-visible,
              input:focus-visible,
              textarea:focus-visible {
                outline: 2px solid #1C1915;
                outline-offset: 2px;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
