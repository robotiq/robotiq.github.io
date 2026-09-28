

C++ driver with functions to control `Robotiq` Adaptive Grippers: 2F85, 2F140 and Hand-E. It allows high communication frequency.

:::note
With the default baudrate of the gripper the maximum achievable communication
frequency is 250Hz. The communication frequency is set with the
`ConnectionConfig::connectionFrequency` parameter, which defaults to 100Hz.
:::

Cross-platform: Linux, Windows, macOS — and freestanding/RTOS targets such
as STM32 microcontrollers.


