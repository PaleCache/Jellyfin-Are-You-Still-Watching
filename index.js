// SCUFFED ARE YOU STILL WATCHING v0.0.6
// MADE WITH ❤️ BY: PALECACHE

import fetch from "node-fetch";

const API_KEY = ""; // ENTER API KEY HERE!
const SERVER_URL = "http://127.0.0.1:8096"; // ENTER SERVER DOMAIN HERE!
const POLL_INTERVAL = 3500;
const MAX_PLAYBACK_MINUTES = 240; // TIMEOUT IN MINUTES
const SESSION_GRACE_PERIOD = 30000; // 30 seconds
const activeSessions = {}; // key: userName + showId

const ActiveHoursStart = 18; // 6:00pm
const ActiveHoursEnd = 7;   // 7:00am

async function checkPlayback() {
  try {
    const timestamp = new Date().toLocaleString("en-US", {
      dateStyle: "short",
      timeStyle: "medium",
      hour12: true
    });
    const URL = `${SERVER_URL}/Sessions?api_key=${API_KEY}`;
    const res = await fetch(URL);
    const text = await res.text();
    let sessions = [];
    try {
      sessions = JSON.parse(text);
    } catch (err) {
      console.error("Failed to parse JSON, skipping this poll.", err);
      return;
    }
        
    const now = new Date();
    const nowMs = now.getTime();
    const currentHour = now.getHours();
    const isActiveHours = (currentHour >= ActiveHoursStart || currentHour < ActiveHoursEnd);
    const currentKeys = new Set();
    const today = new Date(now);
    today.setHours(ActiveHoursStart, 0, 0, 0);
    let activeStartTime = today.getTime();
    if (currentHour < ActiveHoursEnd) {
      today.setDate(today.getDate() - 1);
      today.setHours(ActiveHoursStart, 0, 0, 0);
      activeStartTime = today.getTime();
    }

    for (const session of sessions) {
      if (!session.NowPlayingItem) continue;

      const userName = session.UserName || "Unknown";
      const nowPlaying = session.NowPlayingItem;
      let showId, showName;
      if (nowPlaying.SeriesId) {
        showId = nowPlaying.SeriesId;
        showName = nowPlaying.SeriesName;
      } else {
        showId = nowPlaying.Id;
        showName = nowPlaying.Name;
      }

      const sessionKey = `${userName}-${showId}`;
      currentKeys.add(sessionKey);

      if (!activeSessions[sessionKey]) {
        if (isActiveHours) {
          activeSessions[sessionKey] = { startTime: nowMs, showName, userName };
          console.log(`[${timestamp}] ${userName} started watching: ${showName} (timer active)`);
        } else {
          activeSessions[sessionKey] = { startTime: null, showName, userName };
          console.log(`[${timestamp}] ${userName} started watching: ${showName} (outside active hours, timer paused)`);
        }
      } else {
        const active = activeSessions[sessionKey];
        if (active.pendingRemoval) {
          delete active.pendingRemoval;
        }

        if (active.startTime && !isActiveHours) {
          console.log(`[${timestamp}] Active hours ended for ${userName}. Timer reset for ${showName}`);
          active.startTime = null;
        }

        if (active.startTime === null && isActiveHours) {
          active.startTime = nowMs;
          console.log(`[${timestamp}] ${userName} is now within active hours. Timer started at ${timestamp} for ${showName}`);
        }

        if (active.startTime) {
          const elapsedMinutes = (nowMs - active.startTime) / 1000 / 60;
          if (elapsedMinutes >= MAX_PLAYBACK_MINUTES) {
            if (isActiveHours && !session.PlayState.IsPaused) {
              console.log(`[${timestamp}] ${userName} has been watching "${showName}" > ${MAX_PLAYBACK_MINUTES} minutes. Pausing.`);
              await pausePlayback(session.Id);
              await sendMessage(session.Id, `Hey ${userName} 👋, Are You Still Watching? If So, Please Accept This Message And Unpause The Video 😝`);
              active.startTime = nowMs;
            }
          }
        }
      }
    }

   
    for (const key of Object.keys(activeSessions)) {
      if (!currentKeys.has(key)) {
        const sessionData = activeSessions[key];
        if (!sessionData.pendingRemoval) {
          sessionData.pendingRemoval = nowMs;
        } else if (nowMs - sessionData.pendingRemoval >= SESSION_GRACE_PERIOD) {
          console.log(`[${timestamp}] ${sessionData.userName} stopped watching: ${sessionData.showName}`);
          delete activeSessions[key];
        }
      }
    }

  } catch (err) {
    console.error("Error fetching sessions:", err);
  }
}

async function pausePlayback(sessionId) {
  try {
    const timestamp = new Date().toLocaleString("en-US", {
      dateStyle: "short",
      timeStyle: "medium",
      hour12: true
    });
    const url = `${SERVER_URL}/Sessions/${sessionId}/Playing/Pause?api_key=${API_KEY}`;
    console.log(`[${timestamp}] [DEBUG] Attempting to pause session ${sessionId}`);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    if (response.ok) {
      console.log(`[${timestamp}] Pause command sent successfully for session ${sessionId}`);
    } else {
      const errorText = await response.text();
      console.error(`Failed to pause session ${sessionId}: ${response.status} ${response.statusText} - ${errorText}`);
    }
  } catch (err) {
    console.error(`Error sending pause command for session ${sessionId}:`, err);
  }
}

async function sendMessage(sessionId, message) {
  try {
    const timestamp = new Date().toLocaleString("en-US", {
      dateStyle: "short",
      timeStyle: "medium",
      hour12: true
    });
    const url = `${SERVER_URL}/Sessions/${sessionId}/Message?api_key=${API_KEY}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Text: message,
        Type: "Info"
      })
    });

    if (response.ok) {
      console.log(`[${timestamp}] Message sent to session ${sessionId}: "${message}"`);
    } else {
      const errorText = await response.text();
      console.error(`Failed to send message to session ${sessionId}: ${response.status} ${response.statusText} - ${errorText}`);
    }
  } catch (err) {
    console.error(`Error sending message to session ${sessionId}:`, err);
  }
}

setInterval(checkPlayback, POLL_INTERVAL);
