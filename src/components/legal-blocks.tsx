import type { LegalBlock, LegalSection, Subprocessor } from "~/lib/legal/dpa";

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "p":
      return <p>{block.text}</p>;
    case "ol":
      return (
        <ol className="list-decimal space-y-2 pl-6">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      );
    case "ul":
      return (
        <ul className="list-disc space-y-2 pl-6">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "table":
      return <LegalTable head={block.head} rows={block.rows} />;
  }
}

export function LegalTable({
  head,
  rows,
}: {
  head: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="bg-slate-50 text-slate-900">
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col" className="px-3 py-2 font-semibold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr key={row.join("|")} className="align-top">
              {row.map((cell, index) => (
                <td key={index} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegalSections({ sections }: { sections: LegalSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.id} className="space-y-4">
          <h3
            id={section.id}
            className="scroll-mt-24 text-lg font-semibold text-slate-900"
          >
            {section.title}
          </h3>
          {section.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </div>
      ))}
    </>
  );
}

export function SubprocessorTable({
  subprocessors,
}: {
  subprocessors: Subprocessor[];
}) {
  return (
    <LegalTable
      head={["Subprocessor", "Service", "Data", "Location", "Safeguards"]}
      rows={subprocessors.map((s) => [
        s.name,
        s.service,
        s.data,
        s.location,
        s.safeguards,
      ])}
    />
  );
}
