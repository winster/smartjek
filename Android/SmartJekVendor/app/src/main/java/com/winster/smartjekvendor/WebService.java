package com.winster.smartjekvendor;

import android.content.Context;
import android.preference.PreferenceManager;
import android.util.Base64;
import android.util.Log;
import android.widget.Toast;

import com.android.volley.AuthFailureError;
import com.android.volley.Request;
import com.android.volley.VolleyError;
import com.android.volley.toolbox.JsonObjectRequest;
import com.google.firebase.iid.FirebaseInstanceId;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

/**
 * Created by wjose on 05/07/2016.
 */
public class WebService {

    private static final String TAG = "Webservice";

    /**
     * Persist registration to third-party servers.
     * <p/>
     * Modify this method to associate the user's GCM registration token with any server-side account
     * maintained by your application.
     *
     * @param context
     */
    public static void sendRegistrationToServer(final Context context) {
        String token = FirebaseInstanceId.getInstance().getToken();
        Log.d(TAG, "Refreshed token: " + token);
        if (token == null) {
            return;
        }
        JSONObject jsonRequest = new JSONObject();
        try {
            jsonRequest.put("deviceToken", token);
            JsonObjectRequest gmcTokenReq =
                    new JsonObjectRequest(Request.Method.POST, "https://smartjekhome.herokuapp.com/devicetoken", jsonRequest,
                            new com.android.volley.Response.Listener<JSONObject>() {
                                @Override
                                public void onResponse(JSONObject response) {
                                    Log.d(TAG, response.toString());

                                }
                            }, new com.android.volley.Response.ErrorListener() {
                        @Override
                        public void onErrorResponse(VolleyError error) {
                            Log.e(TAG, error.toString());
                        }
                    }
                    ) {
                        @Override
                        protected Map<String, String> getParams() throws AuthFailureError {
                            Map<String, String> params = new HashMap<String, String>();
                            //add params <key,value>
                            return params;
                        }

                        @Override
                        public Map<String, String> getHeaders() throws AuthFailureError {
                            Map<String, String> headers = new HashMap<>();
                            String user_id = PreferenceManager.
                                    getDefaultSharedPreferences(context).getString("user_id", "");
                            String access_token = PreferenceManager.
                                    getDefaultSharedPreferences(context).getString("access_token", "");
                            String credentials = String.format("%s:%s", user_id, access_token);
                            String auth = "Basic " +
                                    Base64.encodeToString(credentials.getBytes(), Base64.NO_WRAP);
                            headers.put("x-access-token", access_token);
                            return headers;
                        }
                    };
            AppController.getInstance().addToRequestQueue(gmcTokenReq);
        } catch (JSONException e) {
            e.printStackTrace();
        }
    }

    public static void sendWaitingTime(final Context context, String time) {
        JSONObject jsonRequest = new JSONObject();
        try {
            jsonRequest.put("time", time);
            JsonObjectRequest gmcTokenReq =
                    new JsonObjectRequest(Request.Method.POST, "https://smartjekhome.herokuapp.com/waitingTime", jsonRequest,
                            new com.android.volley.Response.Listener<JSONObject>() {
                                @Override
                                public void onResponse(JSONObject response) {
                                    Log.d(TAG, response.toString());
                                    Toast.makeText(context,response.toString(), Toast.LENGTH_SHORT).show();
                                }
                            }, new com.android.volley.Response.ErrorListener() {
                        @Override
                        public void onErrorResponse(VolleyError error) {
                            Log.e(TAG, error.toString());
                        }
                    }
                    ) {
                        @Override
                        protected Map<String, String> getParams() throws AuthFailureError {
                            Map<String, String> params = new HashMap<String, String>();
                            //add params <key,value>
                            return params;
                        }

                        @Override
                        public Map<String, String> getHeaders() throws AuthFailureError {
                            Map<String, String> headers = new HashMap<>();
                            String user_id = PreferenceManager.
                                    getDefaultSharedPreferences(context).getString("user_id", "");
                            String access_token = PreferenceManager.
                                    getDefaultSharedPreferences(context).getString("access_token", "");
                            String credentials = String.format("%s:%s", user_id, access_token);
                            String auth = "Basic " +
                                    Base64.encodeToString(credentials.getBytes(), Base64.NO_WRAP);
                            headers.put("x-access-token", access_token);
                            return headers;
                        }
                    };
            AppController.getInstance().addToRequestQueue(gmcTokenReq);
        } catch (JSONException e) {
            e.printStackTrace();
        }
    }

}