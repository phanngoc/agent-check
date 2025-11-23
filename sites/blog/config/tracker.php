<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Tracker API Configuration
    |--------------------------------------------------------------------------
    |
    | This file contains the configuration for the User Tracker API.
    | The API URL is used to send tracking events to the backend service.
    |
    */

    'api_url' => env('TRACKER_API_URL', 'http://localhost:8085/api/v1'),

];

