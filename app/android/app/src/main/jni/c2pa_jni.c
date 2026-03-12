#include <jni.h>
#include <string.h>

// c2pa-bridge FFI
extern int c2pa_sign_image(
    const char *input_path,
    const char *output_path,
    const char *cert_chain_pem,
    const char *private_key_pem
);

JNIEXPORT jint JNICALL
Java_io_rootlens_app_C2paBridgeModule_nativeSignImage(
    JNIEnv *env,
    jobject thiz,
    jstring input_path,
    jstring output_path,
    jstring cert_chain_pem,
    jstring private_key_pem
) {
    const char *input = (*env)->GetStringUTFChars(env, input_path, NULL);
    const char *output = (*env)->GetStringUTFChars(env, output_path, NULL);
    const char *cert = (*env)->GetStringUTFChars(env, cert_chain_pem, NULL);
    const char *key = (*env)->GetStringUTFChars(env, private_key_pem, NULL);

    int result = c2pa_sign_image(input, output, cert, key);

    (*env)->ReleaseStringUTFChars(env, input_path, input);
    (*env)->ReleaseStringUTFChars(env, output_path, output);
    (*env)->ReleaseStringUTFChars(env, cert_chain_pem, cert);
    (*env)->ReleaseStringUTFChars(env, private_key_pem, key);

    return result;
}

extern char *c2pa_read_manifest(const char *input_path);
extern char *c2pa_get_version(void);
extern void c2pa_free_string(char *s);

JNIEXPORT jstring JNICALL
Java_io_rootlens_app_C2paBridgeModule_nativeReadManifest(
    JNIEnv *env,
    jobject thiz,
    jstring input_path
) {
    const char *input = (*env)->GetStringUTFChars(env, input_path, NULL);

    char *json = c2pa_read_manifest(input);

    (*env)->ReleaseStringUTFChars(env, input_path, input);

    if (json == NULL) {
        return (*env)->NewStringUTF(env, "{\"has_manifest\":false,\"error\":\"null result\"}");
    }

    jstring result = (*env)->NewStringUTF(env, json);
    c2pa_free_string(json);
    return result;
}

JNIEXPORT jstring JNICALL
Java_io_rootlens_app_C2paBridgeModule_nativeGetVersion(
    JNIEnv *env,
    jobject thiz
) {
    char *version = c2pa_get_version();
    jstring result = (*env)->NewStringUTF(env, version);
    c2pa_free_string(version);
    return result;
}
