package com.raptor.raptor_app

import android.app.Notification
import android.content.Intent
import android.graphics.Bitmap
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import io.flutter.plugin.common.EventChannel
import java.io.ByteArrayOutputStream

class MediaNotificationListener : NotificationListenerService() {

    companion object {
        var eventSink: EventChannel.EventSink? = null
        private var activeController: MediaController? = null
        private var instance: MediaNotificationListener? = null
        
        private val callback = object : MediaController.Callback() {
            override fun onMetadataChanged(metadata: MediaMetadata?) {
                sendMetadataUpdate(metadata, activeController?.playbackState)
            }

            override fun onPlaybackStateChanged(state: PlaybackState?) {
                sendMetadataUpdate(activeController?.metadata, state)
            }
        }

        private fun sendMetadataUpdate(metadata: MediaMetadata?, state: PlaybackState?) {
            if (metadata == null) return

            val title = metadata.getString(MediaMetadata.METADATA_KEY_TITLE) ?: "Unknown"
            val artist = metadata.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: "Unknown Artist"
            val album = metadata.getString(MediaMetadata.METADATA_KEY_ALBUM) ?: ""
            val duration = metadata.getLong(MediaMetadata.METADATA_KEY_DURATION)
            val position = state?.position ?: 0L
            val isPlaying = state?.state == PlaybackState.STATE_PLAYING

            // Get album art as bytes
            val albumArt = metadata.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART)
                ?: metadata.getBitmap(MediaMetadata.METADATA_KEY_ART)
            val artBytes = albumArt?.let { bitmapToBytes(it) }

            val data = mapOf(
                "title" to title,
                "artist" to artist,
                "album" to album,
                "duration" to duration,
                "position" to position,
                "isPlaying" to isPlaying,
                "albumArt" to artBytes
            )

            try {
                eventSink?.success(data)
            } catch (_: IllegalStateException) {
                eventSink = null
            } catch (_: RuntimeException) {
                eventSink = null
            }
        }

        private fun bitmapToBytes(bitmap: Bitmap): ByteArray {
            val stream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
            return stream.toByteArray()
        }
        
        // Public method to force refresh
        fun refreshMetadata() {
            instance?.updateActiveSession()
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        instance = this
        updateActiveSession()
    }
    
    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        eventSink = null
        instance = null
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        updateActiveSession()
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        updateActiveSession()
    }

    private fun updateActiveSession() {
        try {
            val manager = getSystemService(MEDIA_SESSION_SERVICE) as MediaSessionManager
            val controllers = manager.getActiveSessions(
                android.content.ComponentName(this, MediaNotificationListener::class.java)
            )

            // Unregister old callback
            activeController?.unregisterCallback(callback)

            // Find active controller - prefer playing, then any active session
            activeController = controllers.firstOrNull { 
                it.playbackState?.state == PlaybackState.STATE_PLAYING 
            } ?: controllers.firstOrNull()

            // Register new callback
            activeController?.registerCallback(callback)

            // Immediately send current metadata
            sendMetadataUpdate(activeController?.metadata, activeController?.playbackState)
        } catch (e: Exception) {
            // Ignore security exceptions if permission not granted
        }
    }
}
