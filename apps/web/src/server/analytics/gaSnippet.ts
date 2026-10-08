/**
 * 从 GA_MEASUREMENT_SNIPPET 环境变量注入 head 内 analytics 片段，源码中不包含 GA 代码。
 */
import { loadEnv, type Plugin } from 'vite';

export function gaSnippetPlugin(): Plugin {
  let snippet = '';

  return {
    name: 'parti-ga-snippet',
    config(_, { mode }) {
      const env = loadEnv(mode, __dirname, '');
      snippet = env.GA_MEASUREMENT_SNIPPET?.trim() ?? '';
    },
    transformIndexHtml(html) {
      if (!snippet) return html;
      return html.replace('</head>', `  ${snippet}\n</head>`);
    },
  };
}