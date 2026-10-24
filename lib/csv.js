function cell(value) {
  let text = String(value ?? "");
  // Quoting alone does not prevent spreadsheet formula execution.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function contactsToCsv(contacts) {
  const rows = [["Type", "Value", "Source URL", "Found at (UTC)"]];
  for (const contact of contacts) {
    for (const source of contact.sources) rows.push([contact.type, contact.value, source, contact.foundAt]);
  }
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
