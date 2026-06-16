export interface MeetingRuntimeEvidencePatchInput {
  appUrl: string;
  browser: string;
  translatorMic: string;
  translatorRemote: string;
  autoInput: boolean;
  inputCheck: string;
  sessionDuration: string;
  laneSegments: string;
  activeLanes: string;
}

export function renderMeetingRuntimeEvidencePatch(
  input: MeetingRuntimeEvidencePatchInput,
): string;
