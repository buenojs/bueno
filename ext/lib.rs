pub mod extensions {
    use bueno_ext_battery as battery;
    use bueno_ext_fs as fs;
    use bueno_ext_performance as performance;
    use bueno_ext_timers as timers;
    use std::time::{Instant, SystemTime};

    deno_core::extension!(
        bueno,
        ops = [
            #[cfg(feature = "battery")]
            battery::op_battery_charging,
            #[cfg(feature = "battery")]
            battery::op_battery_charging_time,
            #[cfg(feature = "battery")]
            battery::op_battery_discharging_time,
            #[cfg(feature = "battery")]
            battery::op_battery_level,
            #[cfg(feature = "fs")]
            fs::op_read_file,
            #[cfg(feature = "fs")]
            fs::op_read_text_file,
            #[cfg(feature = "fs")]
            fs::op_write_file,
            #[cfg(feature = "fs")]
            fs::op_write_text_file,
            #[cfg(feature = "fs")]
            fs::op_remove_file,
            #[cfg(feature = "fs")]
            fs::op_remove_dir,
            #[cfg(feature = "performance")]
            performance::op_high_res_time,
            #[cfg(feature = "performance")]
            performance::op_time_origin,
            #[cfg(feature = "timers")]
            timers::op_create_timer,
            #[cfg(feature = "timers")]
            timers::op_queue_timer,
            #[cfg(feature = "timers")]
            timers::op_queue_timer_deferred,
            #[cfg(feature = "timers")]
            timers::op_clear_timer,
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
        ],
        state = |state| {
            {
                // bueno_ext_perf
                state.put(Instant::now());
                state.put(SystemTime::now());
            };

            {
                // bueno_ext_timers
                state.put(timers::TimerInfo {
                    next_id: 0,
                    timer_handles: vec![],
                });
            };
        }
    );

    deno_core::extension!(
        bueno_cleanup,
        esm_entry_point = "ext:bueno_cleanup/cleanup.js",
        esm = ["cleanup.js",],
    );
}
