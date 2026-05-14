import { memo, useState, useRef } from 'react';
import { Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';

interface Props {
  text: string;
  streaming?: boolean;
}

function MessageContent({ text, streaming }: Props) {
  return (
    <div className="prose-chat text-[14px] leading-relaxed text-white/90 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { ignoreMissing: true }]]}
        components={{
          a: (props) => (
            <a
              {...props}
              className="text-accent underline"
              target="_blank"
              rel="noreferrer"
            />
          ),
          code: ({ className, children, ...rest }: any) => {
            const isBlock = !!className;
            if (!isBlock) {
              return (
                <code
                  className="px-1 py-0.5 rounded bg-white/10 font-mono text-[12.5px]"
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={`${className} font-mono text-[12.5px]`} {...rest}>
                {children}
              </code>
            );
          },
          pre: ({ children, ...rest }: any) => <CodeBlock {...rest}>{children}</CodeBlock>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-1.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-1.5">{children}</ol>,
          h1: ({ children }) => (
            <h1 className="text-base font-semibold mt-2 mb-1">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[15px] font-semibold mt-2 mb-1">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[14px] font-semibold mt-1.5 mb-1">{children}</h3>
          ),
          p: ({ children }) => <p className="my-1.5">{children}</p>,
        }}
      >
        {text || (streaming ? '…' : '')}
      </ReactMarkdown>
      {streaming && (
        <span className="inline-block w-1.5 h-3 bg-white/70 ml-0.5 align-middle animate-pulse" />
      )}
    </div>
  );
}

function CodeBlock({ children, ...rest }: any) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLPreElement>(null);
  const onCopy = async () => {
    try {
      const text = ref.current?.innerText ?? '';
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1300);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="relative group my-2">
      <pre
        ref={ref}
        {...rest}
        className="rounded-lg p-3 pr-9 bg-black/40 border border-white/10 overflow-auto text-[12.5px]"
      >
        {children}
      </pre>
      <button
        onClick={onCopy}
        title="Copy code"
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-white/10 hover:bg-white/20 text-white/85"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
    </div>
  );
}

export default memo(MessageContent);
