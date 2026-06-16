export function renderMeetingRuntimeEvidencePatch({
  appUrl,
  browser,
  translatorMic,
  translatorRemote,
  autoInput,
  inputCheck,
  sessionDuration,
  laneSegments,
  activeLanes,
}) {
  return `## Runtime Evidence

| Field | Value |
| --- | --- |
| app url | ${escapeCell(appUrl)} |
| browser | ${escapeCell(browser)} |
| translator mic | ${escapeCell(translatorMic)} |
| translator remote | ${escapeCell(translatorRemote)} |
| lane map | 私=translator mic; 相手=translator remote/playback |
| input check | ${escapeCell(inputCheck)} |
| session duration | ${escapeCell(sessionDuration)} |
| lane segments | ${escapeCell(laneSegments)} |

## Runtime Notes

- auto input: ${autoInput ? "on" : "off"}
- active lanes: ${activeLanes || "none"}
- remote only:
- mic only:
- alternating:
- no echo:
- duration:
- notes:
`;
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").trim();
}
