import styles from "@/app/manage/operator.module.css";

export default function AgreementDocument({ body }: { body: string }) {
  const blocks = body.split(/\n\s*\n/).filter(Boolean);
  return <article className={styles.agreement}>
    {blocks.map((block, index) => {
      if (block.startsWith("# ")) return <h2 key={index}>{block.slice(2)}</h2>;
      if (block.startsWith("## ")) return <h3 key={index}>{block.slice(3)}</h3>;
      const lines = block.split("\n");
      if (lines.every((line) => line.startsWith("- "))) {
        return <ul key={index}>{lines.map((line, lineIndex) => <li key={lineIndex}>{line.slice(2)}</li>)}</ul>;
      }
      if (lines.every((line) => /^\s*\d+\. /.test(line))) {
        return <div key={index} className={styles.agreementClauses}>{lines.map((line, lineIndex) => {
          const match = /^(\s*)(\d+)\. (.*)$/.exec(line)!;
          return <p key={lineIndex} className={match[1] ? styles.agreementNestedClause : undefined}><span>{match[2]}.</span>{match[3]}</p>;
        })}</div>;
      }
      return <p key={index}>{block}</p>;
    })}
  </article>;
}
