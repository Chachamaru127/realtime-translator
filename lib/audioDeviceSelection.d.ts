export interface AudioSelectionDevice {
  id?: string;
  label: string;
  transport?: string;
}

export function isLoopbackDeviceLabel(label: string): boolean;
export function pickDefaultMicDevice<T extends AudioSelectionDevice>(
  devices: T[],
): T | undefined;
export function pickMeetingDevice<T extends AudioSelectionDevice>(
  devices: T[],
): T | undefined;
