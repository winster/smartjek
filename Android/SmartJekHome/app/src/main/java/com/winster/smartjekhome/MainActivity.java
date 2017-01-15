package com.winster.smartjekhome;

import android.content.Intent;
import android.support.v7.app.AppCompatActivity;
import android.os.Bundle;
import android.view.View;

public class MainActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
    }

    public void connect(View view){
        Intent intent = new Intent(this, ConnectActivity.class);
        startActivity(intent);
    }


    public void services(View view){
        Intent intent = new Intent(this, ServicesActivity.class);
        startActivity(intent);
    }


    public void payment(View view){
        Intent intent = new Intent(this, PaymentActivity.class);
        startActivity(intent);
    }


}
