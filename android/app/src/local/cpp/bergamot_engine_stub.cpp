/**
 * Bergamot stub：未检出 third_party/bergamot-translator 时编译。
 * 真实实现见 bergamot_engine_service.cpp（HAS_BERGAMOT）。
 */
#include "bergamot_engine.h"

#include <stdexcept>

namespace bergamot_engine {

bool engine_ready() {
    return false;
}

const char* engine_error() {
    return "BERGAMOT_NOT_BUILT：请先执行 npm run bergamot:init 拉取 bergamot-translator，"
           "再重新编译 local flavor。";
}

int load(const std::string&, const std::string&) {
    return 1;
}

void unload(const std::string&) {}

void unload_all() {}

std::vector<std::string> translate(const std::string&, const std::vector<std::string>&) {
    throw std::runtime_error(engine_error());
}

}  // namespace bergamot_engine
