pub mod extensions {
    use std::time::{Instant, SystemTime};
    use timers::TimerQueue;

    pub use bueno_ext_battery as battery;
    pub use bueno_ext_fs as fs;
    pub use bueno_ext_performance as performance;
    pub use bueno_ext_runtime as runtime;
    pub use bueno_ext_testing as testing;
    pub use bueno_ext_timers as timers;
    pub use bueno_ext_web as web;

    deno_core::extension!(
        bueno,
        ops = [
            battery::op_battery_charging,
            battery::op_battery_charging_time,
            battery::op_battery_discharging_time,
            battery::op_battery_level,
            runtime::op_runtime_state,
            fs::op_read_file,
            fs::op_read_text_file,
            fs::op_write_file,
            fs::op_write_text_file,
            fs::op_remove_file,
            fs::op_remove_dir,
            performance::op_high_res_time,
            performance::op_time_origin,
            timers::op_timers_sleep,
            timers::op_create_timer,
            testing::op_bench_fn,
            testing::op_diff_str,
            testing::op_test_async_ops_sanitization,
            web::op_encoding_normalize_label,
            web::op_encoding_decode_utf8,
            web::op_encoding_decode_single,
        ],
        esm_entry_point = "ext:bueno/runtime.js",
        esm = [
            "bueno.js",
            "runtime.js",
            "io/mod.js",
            "io/stdio.js",
            "fs/mod.js",
            "battery/mod.js",
            "web/mod.js",
            "web/events.js",
            "web/streams.js",
            "web/encoding.js",
            "console/mod.js",
            "console/printer.js",
            "console/formatter.js",
            "console/table.js",
            "performance/mod.js",
            "timers/mod.js",
            "webidl/mod.js",
            "webidl/numbers.js",
            "webidl/integers.js",
            "utils/ansi.js",
            "utils/strings.js",
            "testing/mod.js",
        ],
        state = |state| {
            // bueno_ext_runtime
            state.put(runtime::RuntimeState::Default);

            // bueno_ext_perf
            state.put(Instant::now());
            state.put(SystemTime::now());

            // bueno_ext_timers
            state.put::<TimerQueue>(Default::default());
        }
    );

    deno_core::extension!(
        bueno_cleanup,
        esm_entry_point = "ext:bueno_cleanup/cleanup.js",
        esm = ["cleanup.js",],
    );
}
