#include <assert.h>
#include <stdint.h>
#include <stdio.h>

#include "ego_stereo_layout.h"

int main(void)
{
    uint8_t sentinel[ego_stereo_decoded_bytes()];
    assert(ego_stereo_decoded_bytes() == 2764800U);
    assert(ego_right_eye_offset_bytes() == 1920U);
    assert(ego_eye_source_span_bytes() == 2762880U);
    assert(ego_left_eye(sentinel) == sentinel);
    assert(ego_right_eye(sentinel) == sentinel + 1920U);
    assert((size_t)(ego_right_eye(sentinel) - sentinel) +
               ego_eye_source_span_bytes() ==
           ego_stereo_decoded_bytes());
    puts("stereo layout: ok");
    return 0;
}
