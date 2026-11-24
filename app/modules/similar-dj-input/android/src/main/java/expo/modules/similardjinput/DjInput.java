package expo.modules.similardjinput;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.util.Log;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * DJ modu: the phone's sound inputs and the one WebRTC records the mic from. The voice engine's audio device module
 * (com.oney.WebRTCModule.WebRTCModuleOptions.audioDeviceModule, LiveKit's JavaAudioDeviceModule) takes a preferred
 * input; it is reached by reflection, as modules/similar-denoise reaches it: a WebRTC build without the call leaves
 * the phone's own choice (logged) rather than breaking the build. Android itself usually records from a USB sound
 * card as soon as one is plugged in; picking it here makes sure, and lets a DJ pick the phone's mic or a cable
 * instead. The choice applies from the next time the mic opens (the engine opens it again when DJ modu changes).
 */
final class DjInput {
  private static final String TAG = "SimilarDjInput";

  private DjInput() {}

  /** usb (a sound card, a mixer or controller with USB audio), line (a cable into the phone), wired, phone, bluetooth, other. */
  static String kindOf(int type) {
    switch (type) {
      case 11: // TYPE_USB_DEVICE
      case 12: // TYPE_USB_ACCESSORY
      case 22: // TYPE_USB_HEADSET
        return "usb";
      case 5: // TYPE_LINE_ANALOG
      case 6: // TYPE_LINE_DIGITAL
      case 19: // TYPE_AUX_LINE
        return "line";
      case 3: // TYPE_WIRED_HEADSET
        return "wired";
      case 15: // TYPE_BUILTIN_MIC
        return "phone";
      case 7: // TYPE_BLUETOOTH_SCO
      case 26: // TYPE_BLE_HEADSET
        return "bluetooth";
      default:
        return "other";
    }
  }

  private static AudioDeviceInfo[] devices(Context context) {
    AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    if (am == null) return new AudioDeviceInfo[0];
    return am.getDevices(AudioManager.GET_DEVICES_INPUTS);
  }

  static List<Map<String, Object>> inputs(Context context) {
    List<Map<String, Object>> out = new ArrayList<>();
    try {
      for (AudioDeviceInfo d : devices(context)) {
        if (!d.isSource()) continue;
        Map<String, Object> m = new HashMap<>();
        m.put("id", (double) d.getId());
        m.put("kind", kindOf(d.getType()));
        CharSequence name = d.getProductName();
        m.put("name", name == null ? "" : name.toString());
        out.add(m);
      }
    } catch (Throwable t) {
      Log.w(TAG, "inputs not read: " + t);
    }
    return out;
  }

  static boolean prefer(Context context, int id) {
    try {
      AudioDeviceInfo pick = null;
      if (id >= 0) {
        for (AudioDeviceInfo d : devices(context)) if (d.getId() == id && d.isSource()) pick = d;
        if (pick == null) return false;
      }
      Class<?> options = Class.forName("com.oney.WebRTCModule.WebRTCModuleOptions");
      Object instance = options.getMethod("getInstance").invoke(null);
      Object adm = options.getField("audioDeviceModule").get(instance);
      if (adm == null) return false;
      adm.getClass().getMethod("setPreferredInputDevice", AudioDeviceInfo.class).invoke(adm, pick);
      Log.i(TAG, "preferred input " + (pick == null ? "the phone's choice" : kindOf(pick.getType()) + " " + pick.getProductName()));
      return true;
    } catch (Throwable t) {
      Log.w(TAG, "preferred input not set: " + t);
      return false;
    }
  }
}
