// js/audio-unlock.js - the three things that leave Web Audio silent on an iPhone and nowhere else.
//
// 1. The ringer switch. Safari plays Web Audio on the "ambient" channel, which the silent switch
//    mutes; <audio> and <video> are not muted, which is why other sites still make sound. Asking
//    for a "playback" audio session puts these tones on the media channel instead.
// 2. The "interrupted" state. Beyond the standard suspended/running/closed, iOS parks a context
//    as "interrupted" when the camera starts, the phone locks, a call comes in or the tab loses
//    focus. It stays silent until resumed, so a check for "suspended" alone never revives it.
// 3. resume() is asynchronous. The state still reads suspended on the line after calling it, so
//    treating that as failure throws away the tap that would have made the sound.
//
// Kept apart from star-audio.js so it can be tested in bare node.

// Anything short of running is silent; only a closed context is beyond help.
function needsResume(state) {
  return state !== 'running' && state !== 'closed'
}

// Ask a context to run. True means it is running or has been asked to - notes scheduled now
// will sound once the resume lands. Call it from a touch or click: iOS ignores a resume that
// does not come from one.
function wake(ctx) {
  if (!ctx || ctx.state === 'closed') return false
  if (needsResume(ctx.state)) {
    try {
      const pending = ctx.resume()
      if (pending && typeof pending.catch === 'function') pending.catch(() => {})
    } catch (e) { /* the next gesture tries again */ }
  }
  return true
}

// Safari 16.4+. A plain property set, no gesture needed; true if the browser took it.
function usePlaybackSession(nav) {
  try {
    if (nav && nav.audioSession) {
      nav.audioSession.type = 'playback'
      return true
    }
  } catch (e) { /* older or locked-down browser: stays on the ambient channel */ }
  return false
}

const AudioUnlock = {needsResume, wake, usePlaybackSession}

// Usable from both the webpack bundle and bare node, so it can be tested without a browser.
if (typeof module !== 'undefined' && module.exports) module.exports = AudioUnlock

export {needsResume, wake, usePlaybackSession}
export default AudioUnlock
