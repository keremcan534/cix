# RNNoise (rnnoise/, BSD-3-Clause) and its JNI bridge: libsimilardenoise.so.
cmake_minimum_required(VERSION 3.13)
project(similardenoise C)

file(GLOB RNNOISE_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/rnnoise/src/*.c)
add_library(similardenoise SHARED ${RNNOISE_SOURCES} similar_denoise_jni.c)
target_include_directories(similardenoise PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/rnnoise/include ${CMAKE_CURRENT_SOURCE_DIR}/rnnoise/src)
target_compile_options(similardenoise PRIVATE -O3 -fvisibility=hidden -Wno-unused-parameter)
target_compile_definitions(similardenoise PRIVATE RNNOISE_BUILD)
target_link_libraries(similardenoise m)
