/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.winster.smartjekvendor;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.support.v4.app.NotificationCompat;
import android.util.Log;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

public class MyGcmListenerService extends FirebaseMessagingService {

    private static final String TAG = "MyGcmListenerService";

    /**
     * Called when message is received.
     *
     * @param message
     */
    // [START receive_message]
    @Override
    public void onMessageReceived(RemoteMessage message) {
        Log.d(TAG, "onMessageReceived");
        Log.d(TAG, "From: " + message.getFrom());
        Log.d(TAG, "Notification Message Body: " + message.getNotification());

        String from = message.getFrom();
        Map data = message.getData();
        if (from.startsWith("/topics/")) {
            // message received from some topic.
        } else {
            // normal downstream message.
        }
        showSmallNotification();

    }


    private void showSmallNotification() {

        NotificationCompat.InboxStyle inboxStyle = new NotificationCompat.InboxStyle();
        inboxStyle.addLine("you have an order");


        final int icon = R.mipmap.ic_launcher;

        Intent resultIntent = new Intent(MyGcmListenerService.this, OrderActivity.class);
        resultIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        final PendingIntent resultPendingIntent =
                PendingIntent.getActivity(
                        this,
                        0,
                        resultIntent,
                        PendingIntent.FLAG_CANCEL_CURRENT
                );

        final NotificationCompat.Builder mBuilder = new NotificationCompat.Builder(
                this);


        final Uri alarmSound = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE
                + "://" + this.getPackageName() + "/raw/notification");

        Notification notification;
        notification = mBuilder.setSmallIcon(icon).setTicker("Order").setWhen(0)
                .setAutoCancel(true)
                .setContentTitle("Order")
                .setContentIntent(resultPendingIntent)
                .setSound(alarmSound)
                .setStyle(inboxStyle)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentText("You have a new order")
                .build();

        NotificationManager notificationManager = (NotificationManager) this.getSystemService(Context.NOTIFICATION_SERVICE);
        notificationManager.notify(101, notification);
    }


}
