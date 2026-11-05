// Web build: a browser offers no hardware or keychain id, so only the install id goes (see device-info.ts).
export type DeviceInfo = { installId: string; hardwareId?: string; keychainId?: string; platform: 'android' | 'ios' | 'web'; model?: string; os?: string; app?: string };

export async function deviceInfo(installId: string): Promise<DeviceInfo> {
  return { installId, platform: 'web' };
}
