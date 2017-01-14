package com.winster.smartjekvendor;

import android.support.v7.app.AppCompatActivity;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;

public class OrderActivity extends AppCompatActivity implements View.OnClickListener {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_order);

        Button button = (Button) findViewById(R.id.accept);
        button.setOnClickListener(this);
    }

    @Override
    public void onClick(View view) {
        if(view.getId()==R.id.accept){
            EditText editText = (EditText) findViewById(R.id.waitingTime);
            String time = editText.getText().toString();
            WebService.sendWaitingTime(this, time);
        }
    }
}
