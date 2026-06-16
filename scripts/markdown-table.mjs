export function parseMarkdownRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  const cells = splitMarkdownCells(trimmed.slice(1, -1)).map((cell) =>
    cell.trim(),
  );
  if (cells.every((cell) => /^:?-+:?$/.test(cell))) return [];
  return cells;
}

function splitMarkdownCells(body) {
  const cells = [];
  let current = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const next = body[index + 1];
    if (char === "\\" && next === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}
