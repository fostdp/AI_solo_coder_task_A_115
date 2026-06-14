mod api;
mod ballistics;
mod siege;
mod storage;
mod config;
mod udp_receiver;
mod ballistic_simulator;
mod siege_evaluator;
mod udp_server;

use api::{AppState, create_router};
use config::AppConfig;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::sync::mpsc;
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() {
    env_logger::init();

    let app_config = Arc::new(AppConfig::load());

    let db = Arc::new(storage::Database::new_with_config(&app_config.storage));

    if let Err(e) = db.load_trebuchets().await {
        eprintln!("Failed to load trebuchets: {}", e);
    }

    if let Err(e) = db.load_wall_types().await {
        eprintln!("Failed to load wall types: {}", e);
    }

    let latest_results = Arc::new(Mutex::new(
        HashMap::<u32, ballistics::BallisticResult>::new(),
    ));
    let latest_siege = Arc::new(Mutex::new(
        HashMap::<u32, siege::SiegeAssessment>::new(),
    ));

    let (udp_tx, ballistic_rx) =
        mpsc::channel::<udp_receiver::SensorEnvelope>(app_config.channel.udp_to_ballistic_capacity);
    let (ballistic_tx, siege_rx) =
        mpsc::channel::<ballistic_simulator::BallisticEnvelope>(app_config.channel.ballistic_to_siege_capacity);

    let udp_cfg = app_config.udp.clone();
    let db_for_udp = db.clone();
    let results_for_legacy = latest_results.clone();
    let siege_for_legacy = latest_siege.clone();

    tokio::spawn(async move {
        if let Err(e) = udp_server::run_udp_server(
            &udp_cfg.bind_addr,
            db_for_udp,
            results_for_legacy,
            siege_for_legacy,
        )
        .await
        {
            eprintln!("Legacy UDP server error (non-fatal): {}", e);
        }
    });

    let udp_cfg_new = Arc::new(app_config.udp.clone());
    tokio::spawn(async move {
        if let Err(e) = udp_receiver::run_udp_receiver(udp_cfg_new, udp_tx).await {
            eprintln!("UDP Receiver service crashed: {}", e);
        }
    });

    let cfg_for_ballistic = app_config.clone();
    let db_for_ballistic = db.clone();
    let results_for_ballistic = latest_results.clone();
    let ballistic = ballistic_simulator::BallisticSimulator::new(
        cfg_for_ballistic,
        db_for_ballistic,
        results_for_ballistic,
        ballistic_rx,
        ballistic_tx,
    );
    tokio::spawn(async move {
        ballistic.run().await;
    });

    let cfg_for_siege = app_config.clone();
    let db_for_siege = db.clone();
    let siege_for_siege = latest_siege.clone();
    let evaluator = siege_evaluator::SiegeEvaluator::new(
        cfg_for_siege,
        db_for_siege,
        siege_for_siege,
        siege_rx,
    );
    tokio::spawn(async move {
        evaluator.run().await;
    });

    let state = AppState {
        db: db.clone(),
        latest_results: latest_results.clone(),
        latest_siege: latest_siege.clone(),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = create_router(state).layer(cors);

    let http_addr = "0.0.0.0:8080";

    println!("=============================================");
    println!("  Trebuchet Siege Simulation Backend");
    println!("  Architecture: UDP Recv → Ballistic → Siege");
    println!("  Channel sizes: UDP→Ballistic={}, Ballistic→Siege={}",
        app_config.channel.udp_to_ballistic_capacity,
        app_config.channel.ballistic_to_siege_capacity
    );
    println!("=============================================");
    println!("HTTP  server: http://{}", http_addr);
    println!("UDP   server: udp://{}", app_config.udp.bind_addr);
    println!("ClickHouse:   disabled (memory buffer)");
    println!("=============================================");

    let addr: std::net::SocketAddr = http_addr.parse().unwrap();
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}
