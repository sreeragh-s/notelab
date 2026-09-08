fn main() {
    println!("cargo:rustc-check-cfg=cfg(local_release)");
    println!("cargo:rerun-if-env-changed=ZILOBASE_LOCAL_RELEASE");
    println!("cargo:rerun-if-env-changed=ZILOBASE_LOCAL_ACCEPTANCE");
    println!("cargo:rerun-if-changed=../../../scripts/desktop/local/release-gate.mjs");
    if std::env::var("ZILOBASE_LOCAL_RELEASE").as_deref() == Ok("1") {
        assert_eq!(
            std::env::var("CARGO_CFG_TARGET_OS").as_deref(),
            Ok("macos"),
            "Local release support is macOS only"
        );
        let acceptance = std::env::var("ZILOBASE_LOCAL_ACCEPTANCE")
            .expect("Reviewed local acceptance record required");
        println!("cargo:rerun-if-changed={acceptance}");
        let status = std::process::Command::new("node")
            .arg("../../../scripts/desktop/local/release-gate.mjs")
            .status()
            .expect("Cannot verify local release acceptance");
        assert!(status.success(), "Local release acceptance is incomplete");
        println!("cargo:rustc-cfg=local_release");
    }
    tauri_build::build()
}
