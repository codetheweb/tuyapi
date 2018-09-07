# From https://docs.tuya.com/en/mcu/mcu-protocol.html

# 00 - Heartbeat Detection

No response

# 01 - Query Product Information

No response

# 02 - Query MCU and set work modes for the module

000055aa00000000000000020000000c00000000320435de0000aa55
000055aa00000000000000020000000c00000000320435de0000aa55

#03 - Report WIFI Work state

No response

#04 - Reset WIFI

No response

#05 - Reset WIFI Selection Mode

No response

#06 - Command Issuing

No response

#07 - Set state

Must use device command object or else no response

#08 - State Query

No response

#09

000055aa00000000000000090000000c00000000b051ab030000aa55
000055aa00000000000000090000000c00000000b051ab030000aa55

#0a - State Query

#0b - ssid_list

{ ssid_list:
   [ 'TP-LINK_7F840E',
     'BELL392',
     'orangeblossom23_RE',
     'Euvalyn',
     'HP-Print-F4-Photosmart 6520',
     'BELL674',
     'killer' ] }

#0c - no response

#0d - no response

#0e - no response

#0e - no response
