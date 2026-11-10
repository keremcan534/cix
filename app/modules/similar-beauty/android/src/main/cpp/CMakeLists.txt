# The video call beauty filter (beauty.c) and its JNI bridge: libsimilarbeauty.so.
cmake_minimum_required(VERSION 3.13)
project(similarbeauty C)

add_library(similarbeauty SHARED beauty.c beauty_jni.c)
target_compile_options(similarbeauty PRIVATE -O3 -fvisibility=hidden)
target_link_libraries(similarbeauty m)
