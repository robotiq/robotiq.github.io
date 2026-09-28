# Robotiq FT Sensor Driver (v1.0.1)

C driver for the Robotiq FT 300 force/torque sensor. It talks to the sensor over a serial (RS-485/Modbus) connection, decodes the streaming force/torque data, and exposes it either as console output, over a TCP socket (for Universal Robots integration), or logged to a CSV file. Despite the `.cpp`-style naming in some contexts, the code itself is plain C (C99), compiled with `gcc`.

## Package layout

```
driver/
├── makefile              # Top-level build rules for all targets
├── src/                  # Platform-independent sensor driver core
│   ├── rq_int.h              # Fixed-width integer typedefs (INT_8, UINT_16, ...)
│   ├── rq_sensor_com.c/.h     # Serial port + Modbus RTU communication with the sensor
│   ├── rq_sensor_state.c/.h   # Driver state machine (init → read info → start stream → run)
│   └── Thread/                # Thin cross-platform wrappers over pthreads / Win32 threads
├── Linux/
│   ├── src/main.c             # Standalone console app (prints readings to stdout)
│   ├── src/rq_sensor_socket.* # TCP server used by the UR build
│   └── UR/main.c              # Universal Robots build: serves sensor data over TCP
├── Windows/
│   ├── src/main.c             # Standalone console app (Windows serial backend)
│   ├── compiler.bat           # Convenience script to build with MinGW
│   └── Data_logger/src/main.c # Interactive CLI tool that logs readings to a CSV file
└── obj/, bin/                # Build output (created by make)
```

The core (`driver/src`) is shared by every target; only the serial-port backend (`rq_sensor_com.c`, guarded by `__unix__` / `_WIN32` macros) and the entry point (`main.c`) differ per platform.

## What it does

1. Scans serial ports (`/dev/ttyS*`, `/dev/ttyUSB*` on Linux; `COM0`–`COM255` on Windows) at 19200 baud looking for a device that answers a Modbus "read firmware version" request starting with `F`.
2. Reads high-level sensor info: firmware version, serial number, production year (Modbus holding registers).
3. Commands the sensor into streaming mode and continuously decodes incoming frames into six force/torque components: `Fx, Fy, Fz` (N) and `Mx, My, Mz` (N·m).
4. Depending on the build target, either prints the values, serves them over TCP, or writes them to a CSV file.

If the connection drops or an invalid stream is detected, the driver automatically returns to the initialization state and retries.

## Prerequisites

- `gcc` and `make`.
- Linux: the user running the driver must belong to the `dialout` group to access the serial port (see `driver/Linux/README`).
- Windows: [MinGW](http://www.mingw.org/) installed (used by `compiler.bat`), plus `zlib1.dll` (bundled in `driver/Windows/`).
- A Robotiq FT sensor connected via its serial adapter.

## Hello world

The quickest way to see the driver work is to build and run the plain Linux console target:

```bash
# from the package root
cd driver
make linux

# make sure your user can access the serial port (log out/in after this once)
sudo usermod -aG dialout $USER

# plug in the FT sensor, then run the driver
./Linux/bin/driverSensor
```

With the sensor connected, the driver auto-detects it and starts printing one line per reading:

```
( 0.010000 , -0.002000 , 9.810000 , 0.001000 , 0.000000 , -0.000500 )
```

That's the sensor saying "hello": each line is a `(Fx, Fy, Fz, Mx, My, Mz)` reading, updated every time a new frame is decoded. Press `Ctrl+C` to stop. See below for the Windows, UR, and data-logger builds.

## Building

All targets are driven by `driver/makefile`, run from the `driver/` directory.

| Command | Produces | Description |
|---|---|---|
| `make windows` | `Windows/bin/driverSensor.exe` | Windows console driver |
| `make linux` | `Linux/bin/driverSensor` | Linux console driver |
| `make universal` | `Linux/UR/bin/driverSensor` | Linux TCP server build for Universal Robots |
| `make data_logger` | `Windows/Data_logger/bin/data_logger.exe` | Windows CSV logging tool |
| `make clean` | — | Removes all build artifacts |

On Windows you can instead double-click/run `driver/Windows/compiler.bat`, which sets up the MinGW `PATH` and calls `make` for you.

Note: `make windows` and `make data_logger` build static libraries (`libRQSensorWin.a`) using `gcc`/`ar` — they are meant to be run from a MinGW shell (e.g. MSYS), not a plain Windows `cmd.exe`, since the makefile relies on Unix-style tools.

## Running

### Console driver (`Linux/bin/driverSensor`, `Windows/bin/driverSensor.exe`)

Run the binary with no arguments. It auto-detects the sensor, then prints one line per reading:

```
( 0.010000 , -0.002000 , 9.810000 , 0.001000 , 0.000000 , -0.000500 )
```

The six values are `Fx, Fy, Fz, Mx, My, Mz`, in that order.

### Universal Robots build (`Linux/UR/bin/driverSensor`)

This build has no console output. Instead it opens two TCP servers on `localhost`:

- **Port 63350** — command/accessor socket. Accepts:
  - `GET SNU` → returns the sensor serial number
  - `GET FWV` → returns the firmware version
  - `GET PYE` → returns the production year
  - `SET ZRO` → zeroes the sensor (tares current force/torque readings as the new baseline)
- **Port 63351** — streaming socket. Continuously pushes the same `( Fx , Fy , Fz , Mx , My , Mz )` formatted string used by the console build, once per decoded frame.

Only one client per socket is supported (`MAX_CLIENTS = 1`).

### Data logger (`Windows/Data_logger/bin/data_logger.exe`)

Interactive CLI:

1. Prompts for the number of samples to record over a 10-second window (1–1000).
2. Prompts for an output filename (defaults to `Data.csv` if left blank; `.csv` is appended automatically).
3. Prints sensor firmware version, serial number, and production year, then streams `t(s),FX,FY,FZ,MX,MY,MZ` rows to both the console and the CSV file at the requested rate.

## Protocol notes

- Communication with the sensor is Modbus RTU over a virtual serial port, slave address `9`, 19200 baud, 8N1.
- Streaming frames are validated with a Modbus-style CRC16 before being decoded; force components are scaled by `/100` and torque components by `/1000` from the raw 16-bit values.
- `rq_com_do_zero_force_flag()` / `SET ZRO` captures the current reading as an offset that is subtracted from all subsequent readings (a software zero/tare, not a sensor recalibration).

## License

BSD 3-Clause, Copyright (c) 2014, Robotiq, Inc. Full text is reproduced at the top of every source file.
